import PropTypes from 'prop-types';
import { UPLOAD_PLATFORMS } from '../../lib/platforms.js';
import { MAX_UPLOAD_ROWS } from '../../lib/useUploadBatch.js';

const SAMPLE_FILES = {
  naver: '/sample-naver-export.csv',
  google: '/sample-google-export.csv',
  meta: '/sample-meta-export.csv',
  kakao: '/sample-kakao-export.csv',
};

/**
 * 3단계 중 0번째(기본 화면). 파일을 고르고, 파일마다 플랫폼을 지정하고, 확정된
 * 배치 목록을 보여준다. 여기서 "파일 처리 시작"을 누르면 MatchStep으로 넘어간다.
 */
export default function UploadQueueStep({
  platform, onPlatform, onAddFiles,
  fileQueue, onQueuePlatform, onRemoveFromQueue, onStartBatch,
  batches, onRemoveBatch, totalRows,
  fileError = '', status, uploadError = '', onUpload,
}) {
  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    onAddFiles(files);
  };

  return (
    <>
      <p className="hint">
        네이버·구글·메타·카카오 광고관리자에서 내보낸 리포트 파일을 추가하세요. 컬럼명을 바꿀 필요 없이,
        여러 제품 캠페인이 섞여 있어도 그대로 올리면 됩니다. 여러 파일을 한 번에 선택할 수 있고, 파일마다
        플랫폼을 지정한 뒤 전체 캠페인을 한 번에 매칭·마진 입력합니다.
        {' '}<a href={SAMPLE_FILES[platform]} download>선택한 플랫폼 예시 파일 보기</a>
      </p>

      <div className="upload-form-row">
        <select value={platform} onChange={(e) => onPlatform(e.target.value)} aria-label="업로드할 플랫폼">
          {UPLOAD_PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input type="file" accept=".xlsx,.csv" multiple onChange={onFiles} aria-label="리포트 파일 선택" />
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
                      onChange={(e) => onQueuePlatform(i, e.target.value)}
                      aria-label={`${entry.file.name}의 플랫폼`}
                    >
                      {UPLOAD_PLATFORMS.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" className="ghost" onClick={() => onRemoveFromQueue(i)}>
                      제거
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="upload-form-row">
            <button type="button" className="ghost primary" onClick={onStartBatch}>
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
              <button type="button" className="ghost" onClick={() => onRemoveBatch(i)}>제거</button>
            </li>
          ))}
        </ul>
      )}

      {batches.length > 0 && (
        <div className="upload-preview">
          <p className="hint">
            {batches.length}개 파일, 총 {totalRows.toLocaleString('ko-KR')}행을 합쳐서 올립니다.
            {totalRows > MAX_UPLOAD_ROWS
              && ` (한 번에 ${MAX_UPLOAD_ROWS.toLocaleString('ko-KR')}행까지만 가능합니다)`}
          </p>
          <button type="button" className="ghost" onClick={onUpload} disabled={status === 'uploading'}>
            {status === 'uploading' ? '업로드 중…' : '업로드'}
          </button>
        </div>
      )}

      {status === 'error' && <p className="upload-error">{uploadError}</p>}
    </>
  );
}

UploadQueueStep.propTypes = {
  platform: PropTypes.string.isRequired,
  onPlatform: PropTypes.func.isRequired,
  onAddFiles: PropTypes.func.isRequired,
  fileQueue: PropTypes.arrayOf(PropTypes.shape({
    file: PropTypes.object.isRequired,
    platform: PropTypes.string.isRequired,
  })).isRequired,
  onQueuePlatform: PropTypes.func.isRequired,
  onRemoveFromQueue: PropTypes.func.isRequired,
  onStartBatch: PropTypes.func.isRequired,
  batches: PropTypes.arrayOf(PropTypes.shape({
    platform: PropTypes.string.isRequired,
    rows: PropTypes.array.isRequired,
    products: PropTypes.array.isRequired,
  })).isRequired,
  onRemoveBatch: PropTypes.func.isRequired,
  totalRows: PropTypes.number.isRequired,
  fileError: PropTypes.string,
  status: PropTypes.string.isRequired,
  uploadError: PropTypes.string,
  onUpload: PropTypes.func.isRequired,
};
