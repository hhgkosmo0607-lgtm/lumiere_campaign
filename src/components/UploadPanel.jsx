import { useState } from 'react';
import { parsePlatformFile } from '../lib/parseExcel';
import { UPLOAD_PLATFORMS, derivePlatforms } from '../lib/platforms';
import { createUpload } from '../lib/uploadFirestore';

const SAMPLE_FILES = {
  naver: '/sample-naver-export.csv',
  google: '/sample-google-export.csv',
  meta: '/sample-meta-export.csv',
  kakao: '/sample-kakao-export.csv',
};

// 캠페인 이름에 흔히 섞여 들어가는 플랫폼명·캠페인 유형·타겟팅 단어. 제품명이 아니라서 걷어낸다.
const CAMPAIGN_STOPWORDS = new Set([
  '네이버', '구글', '메타', '카카오', '페이스북', '인스타', '인스타그램', '유튜브',
  'naver', 'google', 'meta', 'kakao', 'facebook', 'instagram', 'youtube',
  '검색', '리타겟팅', '타겟팅', '브랜드', '일반', '프로모션', '이벤트', '시즌',
  '신규', '재구매', '전환', '트래픽', '인지도', '도달', '디스플레이', '배너',
  '쇼핑', '스토리', '릴스', '피드', '선물하기', '톡딜', '비즈보드', '메시지', '다이나믹',
  'search', 'retargeting', 'targeting', 'brand', 'display', 'shopping',
  'story', 'reels', 'feed', 'conversion', 'traffic', 'awareness', 'reach',
]);

// 캠페인명을 구분자로 쪼갠 뒤 플랫폼·캠페인유형 같은 흔한 단어와 순수 숫자(날짜 등)를 걷어내고
// 남는 부분을 제품명 후보로 삼는다. 예: "세럼_검색_브랜드" -> "세럼".
function stripCampaignStopwords(campaignName) {
  const tokens = campaignName.split(/[_\-/|\s[\]()]+/).filter(Boolean);
  const kept = tokens.filter((t) => !/^\d+$/.test(t) && !CAMPAIGN_STOPWORDS.has(t.toLowerCase()));
  return kept.join(' ').trim();
}

// 1순위: 캠페인명 안에 이미 알고 있는 제품명의 단어가 들어있으면 그 제품으로 추측한다.
// 예: "비타민C 세럼" -> ["비타민C","세럼"] 중 하나가 캠페인명에 있으면 그 제품명 전체를 제안.
// 2순위(알고 있는 제품이 하나도 없는 첫 파일 등): 흔한 단어를 걷어낸 나머지를 제품명 후보로 쓴다.
// 캠페인 이름 짓는 방식은 회사·채널마다 달라서 100% 맞지 않는다 — 반복 입력을 줄여주는 정도다.
function guessProduct(campaignName, knownProducts) {
  for (const p of knownProducts) {
    const words = p.split(' ');
    if (words.some((w) => w.length >= 2 && campaignName.includes(w))) return p;
  }
  return stripCampaignStopwords(campaignName);
}

// 네이버·구글·메타·카카오가 실제로 내보내는 리포트 파일을 그대로 받는다. 컬럼명은 플랫폼마다 다르므로
// 파일을 추가할 때 어느 플랫폼인지 고르면 그 플랫폼의 네이티브 컬럼명으로 읽는다.
// 리포트 하나엔 보통 여러 제품의 캠페인이 섞여 있으므로, 파일을 올리면 그 안의 캠페인명을 뽑아
// 캠페인마다 제품을 매칭받는다(캠페인명 키워드로 자동 추측 후 확인). margin(마진율)은 캠페인이
// 아니라 제품 단위로 한 번만 입력받는다 — 같은 제품인데 마진율이 서로 다르게 들어가는 걸 막는다.
export default function UploadPanel({ onUploaded }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState(UPLOAD_PLATFORMS[0].id);
  const [fileError, setFileError] = useState('');
  const [batches, setBatches] = useState([]); // { platform, fileName, rows, products: [{name, rows}] }
  const [fileQueue, setFileQueue] = useState([]); // { file, platform }[] — 한 번에 고른 파일들, 아직 처리 전

  // 매칭 중인 배치(대기열의 파일 전부를 한 번에 처리). step: 'matching'(캠페인->제품) | 'margin'(제품별 마진율) | null(없음)
  const [pendingBatch, setPendingBatch] = useState(null); // { files: [{platform, fileName, rows}], campaigns: [{key, fileIdx, platform, fileName, name, count}] }
  const [step, setStep] = useState(null);
  const [campaignProduct, setCampaignProduct] = useState({}); // "fileIdx|캠페인명" -> 제품명
  const [productMargin, setProductMargin] = useState({}); // 제품명 -> 마진율 입력값(문자열)

  const [status, setStatus] = useState('idle'); // idle | uploading | done | error
  const [uploadError, setUploadError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // 이 세션에서 지금까지 확정한 제품명들 — 다음 파일의 자동 추측·마진율 미리 채우기에 쓴다.
  const knownProducts = [...new Set(batches.flatMap((b) => b.products.map((p) => p.name)))];
  const knownMargins = {};
  batches.forEach((b) => b.rows.forEach((r) => {
    if (r.margin != null && knownMargins[r.product] == null) knownMargins[r.product] = r.margin;
  }));

  const resetPanel = () => {
    setBatches([]);
    setFileError('');
    setPendingBatch(null);
    setStep(null);
    setCampaignProduct({});
    setProductMargin({});
    setFileQueue([]);
    setStatus('idle');
    setUploadError('');
    setShareUrl('');
  };

  // 여러 파일을 한 번에 선택할 수 있다 — 파일마다 플랫폼이 다를 수 있어 바로 파싱하지 않고
  // 대기열에 담아 사람이 파일별로 플랫폼을 지정하게 한다.
  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setFileError('');
    setFileQueue((prev) => [...prev, ...files.map((file) => ({ file, platform }))]);
  };

  // 대기열의 파일을 전부 한 번에 파싱해서 캠페인을 하나의 매칭 표로 합친다 — 파일이 여러 개여도
  // 매칭 화면 1번, 마진 화면 1번으로 끝나게 하기 위함(예전엔 파일마다 두 화면씩 반복했다).
  const startBatch = async (queue) => {
    if (queue.length === 0) return;
    setFileError('');

    const files = [];
    for (const entry of queue) {
      const result = await parsePlatformFile(entry.file, entry.platform);
      if (!result.ok) {
        setFileError(`"${entry.file.name}": ${result.error}`);
        return; // 하나라도 실패하면 대기열은 그대로 두고 중단 — 사람이 고치고 다시 시도
      }
      files.push({ platform: entry.platform, fileName: entry.file.name, rows: result.rows });
    }

    const campaigns = [];
    const guesses = {};
    files.forEach((f, fileIdx) => {
      const counts = new Map();
      f.rows.forEach((r) => counts.set(r.campaign, (counts.get(r.campaign) || 0) + 1));
      counts.forEach((count, name) => {
        const key = `${fileIdx}|${name}`;
        campaigns.push({ key, fileIdx, platform: f.platform, fileName: f.fileName, name, count });
        guesses[key] = guessProduct(name, knownProducts);
      });
    });

    setFileQueue([]);
    setPendingBatch({ files, campaigns });
    setCampaignProduct(guesses);
    setStep('matching');
  };

  const goToMargin = () => {
    const products = [...new Set(Object.values(campaignProduct).map((v) => v.trim() || '(미지정)'))];
    const margins = {};
    products.forEach((p) => {
      margins[p] = knownMargins[p] != null ? String(Math.round(knownMargins[p] * 100)) : '';
    });
    setProductMargin(margins);
    setStep('margin');
  };

  const cancelBatch = () => {
    setPendingBatch(null);
    setStep(null);
    setCampaignProduct({});
    setProductMargin({});
  };

  const confirmBatch = () => {
    // 마진율 형식 검증 (비워두는 건 허용)
    for (const [product, input] of Object.entries(productMargin)) {
      if (input.trim() === '') continue;
      const n = Number(input);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        setFileError(`"${product}"의 마진율은 0보다 크고 100 이하인 숫자로 입력하세요 (예: 60).`);
        return;
      }
    }
    setFileError('');

    // 캠페인 키(fileIdx|캠페인명) -> 제품 매핑을 이용해 원래 파일 단위로 다시 나눠 batches에 넣는다.
    const newBatches = pendingBatch.files.map((f, fileIdx) => {
      const rows = f.rows.map((r) => {
        const key = `${fileIdx}|${r.campaign}`;
        const product = (campaignProduct[key] || '').trim() || '(미지정)';
        const marginInput = productMargin[product];
        const margin = marginInput && marginInput.trim() !== '' ? Number(marginInput) / 100 : null;
        return { ...r, product, margin };
      });
      const productSummary = [...new Set(rows.map((r) => r.product))].map((name) => ({
        name,
        rows: rows.filter((r) => r.product === name).length,
      }));
      return { platform: f.platform, fileName: f.fileName, rows, products: productSummary };
    });

    setBatches((prev) => [...prev, ...newBatches]);
    cancelBatch();
  };

  const removeBatch = (idx) => {
    setBatches((prev) => prev.filter((_, i) => i !== idx));
  };

  const upload = async () => {
    const allRows = batches.flatMap((b) => b.rows);
    if (allRows.length === 0) return;
    setStatus('uploading');
    try {
      const platforms = derivePlatforms(allRows);
      const id = await createUpload(allRows, platforms);
      const url = new URL(window.location.href);
      url.search = `?d=${id}`;
      window.history.pushState(null, '', url);
      setShareUrl(url.toString());
      setStatus('done');
      onUploaded(allRows, platforms);
    } catch (err) {
      setStatus('error');
      setUploadError(err.message || '업로드에 실패했습니다.');
    }
  };

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="ghost" onClick={() => setOpen(true)}>
        내 데이터로 새 대시보드 만들기
      </button>
    );
  }

  const productList = [...new Set([...knownProducts, ...Object.values(campaignProduct).filter(Boolean)])];

  return (
    <div className="upload-panel">
      <div className="upload-panel-head">
        <p className="eyebrow" style={{ margin: 0 }}>내 데이터로 새 대시보드 만들기</p>
        <button type="button" className="ghost" onClick={() => { setOpen(false); resetPanel(); }}>
          닫기
        </button>
      </div>

      {status === 'done' ? (
        <div className="upload-preview">
          <p className="hint">완료됐습니다. 아래 링크를 보내면 상대방도 같은 데이터를 봅니다.</p>
          <button type="button" className="ghost" onClick={copyShareUrl}>
            {copied ? '복사됨' : '링크 복사'}
          </button>
        </div>
      ) : step === 'matching' ? (
        <>
          <p className="hint">
            파일 {pendingBatch.files.length}개에서 캠페인 {pendingBatch.campaigns.length}개를 찾았습니다. 캠페인명에
            제품명 키워드가 있으면 자동으로 추측해 채워뒀습니다 — 틀렸으면 고치고, 처음 보는 캠페인이면 직접 입력하세요.
          </p>
          <table className="match-table">
            <thead>
              <tr><th>파일(플랫폼)</th><th>캠페인명 (원본)</th><th>행 수</th><th>제품</th></tr>
            </thead>
            <tbody>
              {pendingBatch.campaigns.map((c) => (
                <tr key={c.key}>
                  <td className="campaign-name">{UPLOAD_PLATFORMS.find((p) => p.id === c.platform)?.name ?? c.platform}</td>
                  <td className="campaign-name">{c.name}</td>
                  <td className="num">{c.count}행</td>
                  <td>
                    <input
                      type="text"
                      list="upload-product-list"
                      value={campaignProduct[c.key] || ''}
                      onChange={(e) => setCampaignProduct((prev) => ({ ...prev, [c.key]: e.target.value }))}
                      placeholder="제품명 입력"
                      className={campaignProduct[c.key] ? 'auto' : ''}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="upload-product-list">
            {productList.map((p) => <option key={p} value={p} />)}
          </datalist>
          {fileError && <p className="upload-error">{fileError}</p>}
          <div className="upload-form-row">
            <button type="button" className="ghost" onClick={cancelBatch}>취소</button>
            <button type="button" className="ghost primary" onClick={goToMargin}>다음 — 제품별 마진율 입력</button>
          </div>
        </>
      ) : step === 'margin' ? (
        <>
          <p className="hint">
            같은 제품이면 마진율은 여기서 한 번만 입력합니다 — 캠페인마다 따로 안 받아서 값이 어긋날 일이 없습니다. 비워두면 마진 없이 올라갑니다(ROI 계산 불가).
          </p>
          <table className="match-table">
            <thead>
              <tr><th>제품</th><th>마진율%</th></tr>
            </thead>
            <tbody>
              {Object.keys(productMargin).map((product) => (
                <tr key={product}>
                  <td className="campaign-name">{product}</td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={productMargin[product]}
                      onChange={(e) => setProductMargin((prev) => ({ ...prev, [product]: e.target.value }))}
                      placeholder="예: 55"
                      className="margin"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {fileError && <p className="upload-error">{fileError}</p>}
          <div className="upload-form-row">
            <button type="button" className="ghost" onClick={() => setStep('matching')}>이전</button>
            <button type="button" className="ghost primary" onClick={confirmBatch}>이 파일들 추가</button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            네이버·구글·메타·카카오 광고관리자에서 내보낸 리포트 파일을 추가하세요. 컬럼명을 바꿀 필요 없이,
            여러 제품 캠페인이 섞여 있어도 그대로 올리면 됩니다. 여러 파일을 한 번에 선택할 수 있고, 파일마다
            플랫폼을 지정한 뒤 전체 캠페인을 한 번에 매칭·마진 입력합니다.
            {' '}<a href={SAMPLE_FILES[platform]} download>선택한 플랫폼 예시 파일 보기</a>
          </p>

          <div className="upload-form-row">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {UPLOAD_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input type="file" accept=".xlsx,.csv" multiple onChange={onFiles} />
          </div>

          {fileError && <p className="upload-error">{fileError}</p>}

          {fileQueue.length > 0 && (
            <>
              <table className="match-table">
                <thead>
                  <tr><th>선택한 파일</th><th>플랫폼</th><th /></tr>
                </thead>
                <tbody>
                  {fileQueue.map((entry, i) => (
                    <tr key={i}>
                      <td className="campaign-name">{entry.file.name}</td>
                      <td>
                        <select
                          value={entry.platform}
                          onChange={(e) => setFileQueue((prev) => prev.map((f, idx) => (idx === i ? { ...f, platform: e.target.value } : f)))}
                        >
                          {UPLOAD_PLATFORMS.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button type="button" className="ghost" onClick={() => setFileQueue((prev) => prev.filter((_, idx) => idx !== i))}>
                          제거
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="upload-form-row">
                <button type="button" className="ghost primary" onClick={() => startBatch(fileQueue)}>
                  파일 처리 시작 ({fileQueue.length}개 대기 중)
                </button>
              </div>
            </>
          )}

          {batches.length > 0 && (
            <ul className="upload-batches">
              {batches.map((b, i) => (
                <li key={i}>
                  <span>
                    {UPLOAD_PLATFORMS.find((p) => p.id === b.platform)?.name ?? b.platform}
                    {' '}({b.rows.length}행, {b.products.map((p) => p.name).join(' · ')})
                  </span>
                  <button type="button" className="ghost" onClick={() => removeBatch(i)}>제거</button>
                </li>
              ))}
            </ul>
          )}

          {batches.length > 0 && (
            <div className="upload-preview">
              <p className="hint">
                {batches.length}개 파일, 총 {batches.reduce((a, b) => a + b.rows.length, 0)}행을 합쳐서 올립니다.
              </p>
              <button type="button" className="ghost" onClick={upload} disabled={status === 'uploading'}>
                {status === 'uploading' ? '업로드 중…' : '업로드'}
              </button>
            </div>
          )}

          {status === 'error' && <p className="upload-error">{uploadError}</p>}
        </>
      )}
    </div>
  );
}
