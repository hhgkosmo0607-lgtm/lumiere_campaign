import { useState } from 'react';
import { parsePlatformFile } from './parseExcel.js';
import { UPLOAD_PLATFORMS, derivePlatforms } from './platforms.js';
import { createUpload } from './uploadFirestore.js';

// 업로드 한 번에 올릴 수 있는 최대 행수. 저장소가 문서 하나를 1MB로 제한하는데
// 한 행이 대략 230바이트라, 3,000행이면 약 700KB로 여유가 있다.
// 이 값은 Firestore 보안 규칙의 rows.size() 제한과 반드시 같아야 한다 (README.md 4번 참고).
export const MAX_UPLOAD_ROWS = 3000;

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
export function stripCampaignStopwords(campaignName) {
  const tokens = campaignName.split(/[_\-/|\s[\]()]+/).filter(Boolean);
  const kept = tokens.filter((t) => !/^\d+$/.test(t) && !CAMPAIGN_STOPWORDS.has(t.toLowerCase()));
  return kept.join(' ').trim();
}

// 1순위: 캠페인명 안에 이미 알고 있는 제품명의 단어가 들어있으면 그 제품으로 추측한다.
// 예: "비타민C 세럼" -> ["비타민C","세럼"] 중 하나가 캠페인명에 있으면 그 제품명 전체를 제안.
// 2순위(알고 있는 제품이 하나도 없는 첫 파일 등): 흔한 단어를 걷어낸 나머지를 제품명 후보로 쓴다.
// 캠페인 이름 짓는 방식은 회사·채널마다 달라서 100% 맞지 않는다 — 반복 입력을 줄여주는 정도다.
export function guessProduct(campaignName, knownProducts) {
  for (const p of knownProducts) {
    const words = p.split(' ');
    if (words.some((w) => w.length >= 2 && campaignName.includes(w))) return p;
  }
  return stripCampaignStopwords(campaignName);
}

/**
 * 업로드 화면 전체의 상태와 로직을 담은 커스텀 훅. UploadPanel.jsx와 그 아래 4개
 * 하위 컴포넌트(UploadQueueStep, MatchStep, MarginStep, UploadDoneStep)가 전부
 * 이 훅 하나를 같이 쓴다 — "화면을 그리는 코드"와 "무엇을 할지 결정하는 코드"를
 * 분리해두면, 화면 배치만 바꾸고 싶을 때 이 파일은 안 건드려도 된다.
 *
 * 이 세 값(step, pendingBatch, campaignProduct/productMargin)이 서로 맞물려 움직이는
 * "상태 머신" 구조는 학습노트.md 3-6절에서 그림으로 설명해뒀다.
 */
export default function useUploadBatch({ onUploaded }) {
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

  // 이 세션에서 지금까지 확정한 제품명들 — 다음 파일의 자동 추측·마진율 미리 채우기에 쓴다.
  const knownProducts = [...new Set(batches.flatMap((b) => b.products.map((p) => p.name)))];
  const knownMargins = {};
  batches.forEach((b) => b.rows.forEach((r) => {
    if (r.margin != null && knownMargins[r.product] == null) knownMargins[r.product] = r.margin;
  }));
  const productList = [...new Set([...knownProducts, ...Object.values(campaignProduct).filter(Boolean)])];
  const totalRows = batches.reduce((a, b) => a + b.rows.length, 0);

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
  const addFiles = (files) => {
    if (files.length === 0) return;
    setFileError('');
    setFileQueue((prev) => [...prev, ...files.map((file) => ({ file, platform }))]);
  };

  const setQueueFilePlatform = (index, newPlatform) => {
    setFileQueue((prev) => prev.map((f, i) => (i === index ? { ...f, platform: newPlatform } : f)));
  };

  const removeFromQueue = (index) => {
    setFileQueue((prev) => prev.filter((_, i) => i !== index));
  };

  // 대기열의 파일을 전부 한 번에 파싱해서 캠페인을 하나의 매칭 표로 합친다 — 파일이 여러 개여도
  // 매칭 화면 1번, 마진 화면 1번으로 끝나게 하기 위함(예전엔 파일마다 두 화면씩 반복했다).
  const startBatch = async () => {
    if (fileQueue.length === 0) return;
    setFileError('');

    const files = [];
    for (const entry of fileQueue) {
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

  const setCampaignProductFor = (key, value) => {
    setCampaignProduct((prev) => ({ ...prev, [key]: value }));
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

  const setMarginFor = (product, value) => {
    setProductMargin((prev) => ({ ...prev, [product]: value }));
  };

  const backToMatching = () => setStep('matching');

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
    // 한 번에 올릴 수 있는 양에 한계가 있다(저장소가 문서 하나의 크기를 제한한다).
    // 넘으면 서버가 영문 오류를 돌려주므로, 그 전에 무엇을 하면 되는지 한국어로 알려준다.
    if (allRows.length > MAX_UPLOAD_ROWS) {
      setStatus('error');
      setUploadError(
        `한 번에 ${MAX_UPLOAD_ROWS.toLocaleString('ko-KR')}행까지 올릴 수 있는데 지금 ${allRows.length.toLocaleString('ko-KR')}행입니다. ` +
        '기간을 나눠서(예: 앞 절반 / 뒤 절반) 두 번에 올리거나, 파일 몇 개를 빼고 올려주세요.'
      );
      return;
    }
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

  return {
    platform, setPlatform,
    fileError,
    fileQueue, addFiles, setQueueFilePlatform, removeFromQueue,
    batches, removeBatch, totalRows,
    pendingBatch, step, campaignProduct, setCampaignProductFor, productList,
    productMargin, setMarginFor,
    status, uploadError, shareUrl,
    startBatch, goToMargin, backToMatching, cancelBatch, confirmBatch, upload,
    resetPanel,
  };
}
