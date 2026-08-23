import PropTypes from 'prop-types';
import { UPLOAD_PLATFORMS } from '../../lib/platforms.js';

/**
 * 3단계 중 1번째. 대기열의 파일 전부를 한 번에 파싱해서 나온 캠페인 목록을 보여주고,
 * 캠페인마다 어느 제품인지 확인·수정받는다. 파일이 몇 개든 이 화면은 한 번만 뜬다.
 */
export default function MatchStep({
  pendingBatch, campaignProduct, onCampaignProduct, productList,
  fileError = '', onCancel, onNext,
}) {
  return (
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
                  onChange={(e) => onCampaignProduct(c.key, e.target.value)}
                  placeholder="제품명 입력"
                  aria-label={`${c.name} 캠페인의 제품명`}
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
        <button type="button" className="ghost" onClick={onCancel}>취소</button>
        <button type="button" className="ghost primary" onClick={onNext}>다음 — 제품별 마진율 입력</button>
      </div>
    </>
  );
}

MatchStep.propTypes = {
  pendingBatch: PropTypes.shape({
    files: PropTypes.array.isRequired,
    campaigns: PropTypes.arrayOf(PropTypes.shape({
      key: PropTypes.string.isRequired,
      platform: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      count: PropTypes.number.isRequired,
    })).isRequired,
  }).isRequired,
  campaignProduct: PropTypes.objectOf(PropTypes.string).isRequired,
  onCampaignProduct: PropTypes.func.isRequired,
  productList: PropTypes.arrayOf(PropTypes.string).isRequired,
  fileError: PropTypes.string,
  onCancel: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
};
