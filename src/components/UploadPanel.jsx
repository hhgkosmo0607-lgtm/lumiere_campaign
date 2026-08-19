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

// 네이버·구글·메타가 실제로 내보내는 리포트 파일을 그대로 받는다. 컬럼명은 플랫폼마다 다르므로
// 파일을 추가할 때 어느 플랫폼인지 고르면 그 플랫폼의 네이티브 컬럼명으로 읽는다.
// product·margin은 리포트에 없는 값이라, 파일 하나를 추가할 때 함께 입력받아 그 파일의
// 모든 행에 붙인다(파일 하나 = 플랫폼 하나 + 제품 하나라는 전제). 여러 플랫폼 파일을 계속
// 추가해서 하나의 통합 데이터셋으로 합친 뒤 업로드한다.
export default function UploadPanel({ onUploaded }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState(UPLOAD_PLATFORMS[0].id);
  const [product, setProduct] = useState('');
  const [marginInput, setMarginInput] = useState('');
  const [fileError, setFileError] = useState('');
  const [batches, setBatches] = useState([]); // { platform, product, margin, rows, fileName }

  const [status, setStatus] = useState('idle'); // idle | uploading | done | error
  const [uploadError, setUploadError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const resetPanel = () => {
    setBatches([]);
    setFileError('');
    setStatus('idle');
    setUploadError('');
    setShareUrl('');
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError('');

    let margin = null;
    if (marginInput.trim() !== '') {
      const n = Number(marginInput);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        setFileError('마진율은 0보다 크고 100 이하인 숫자로 입력하세요 (예: 60).');
        return;
      }
      margin = n / 100;
    }

    const result = await parsePlatformFile(file, platform);
    if (!result.ok) {
      setFileError(result.error);
      return;
    }

    const rows = result.rows.map((r) => ({ ...r, product: product.trim(), margin }));
    setBatches((prev) => [
      ...prev,
      { platform, product: product.trim(), margin, rows, fileName: file.name },
    ]);
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
      ) : (
        <>
          <p className="hint">
            네이버·구글·메타·카카오 광고관리자에서 내보낸 리포트 파일을 플랫폼별로 추가하세요.
            컬럼명을 바꿀 필요 없이 그대로 올리면 됩니다.
            {' '}<a href={SAMPLE_FILES[platform]} download>선택한 플랫폼 예시 파일 보기</a>
          </p>

          <div className="upload-form-row">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {UPLOAD_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="제품 (선택)"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="마진율% (선택)"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
            />
            <input type="file" accept=".xlsx,.csv" onChange={onFile} />
          </div>

          {fileError && <p className="upload-error">{fileError}</p>}

          {batches.length > 0 && (
            <ul className="upload-batches">
              {batches.map((b, i) => (
                <li key={i}>
                  <span>
                    {UPLOAD_PLATFORMS.find((p) => p.id === b.platform)?.name ?? b.platform}
                    {' '}({b.rows.length}행{b.product ? `, ${b.product}` : ''})
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
