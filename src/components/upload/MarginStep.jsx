import PropTypes from 'prop-types';

/**
 * 3단계 중 2번째. MatchStep에서 확정된 고유 제품별로 마진율을 한 번씩만 입력받는다.
 * 캠페인 단위로 따로 받지 않는 이유는 같은 제품인데 값이 서로 어긋나는 실수를 막기 위해서다
 * (자세한 이유는 CLAUDE.md "업로드" 절 참고).
 */
export default function MarginStep({
  productMargin, onMargin, fileError = '', onBack, onConfirm,
}) {
  return (
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
                  onChange={(e) => onMargin(product, e.target.value)}
                  placeholder="예: 55"
                  aria-label={`${product}의 마진율(%)`}
                  className="margin"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {fileError && <p className="upload-error">{fileError}</p>}
      <div className="upload-form-row">
        <button type="button" className="ghost" onClick={onBack}>이전</button>
        <button type="button" className="ghost primary" onClick={onConfirm}>이 파일들 추가</button>
      </div>
    </>
  );
}

MarginStep.propTypes = {
  productMargin: PropTypes.objectOf(PropTypes.string).isRequired,
  onMargin: PropTypes.func.isRequired,
  fileError: PropTypes.string,
  onBack: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};
