import { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * 업로드가 끝난 뒤 보여주는 화면. 공유 링크를 복사하는 버튼 하나뿐이라 다른
 * 단계(MatchStep, MarginStep)보다 훨씬 단순하다.
 */
export default function UploadDoneStep({ shareUrl }) {
  const [copied, setCopied] = useState(false);

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="upload-preview">
      <p className="hint">완료됐습니다. 아래 링크를 보내면 상대방도 같은 데이터를 봅니다.</p>
      <button type="button" className="ghost" onClick={copyShareUrl}>
        {copied ? '복사됨' : '링크 복사'}
      </button>
    </div>
  );
}

UploadDoneStep.propTypes = {
  shareUrl: PropTypes.string.isRequired,
};
