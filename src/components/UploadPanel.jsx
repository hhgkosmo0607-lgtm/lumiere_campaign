import { useState } from 'react';
import PropTypes from 'prop-types';
import useUploadBatch from '../lib/useUploadBatch.js';
import UploadQueueStep from './upload/UploadQueueStep.jsx';
import MatchStep from './upload/MatchStep.jsx';
import MarginStep from './upload/MarginStep.jsx';
import UploadDoneStep from './upload/UploadDoneStep.jsx';

/**
 * 네이버·구글·메타·카카오가 실제로 내보내는 리포트 파일을 그대로 받는다. 컬럼명은 플랫폼마다 다르므로
 * 파일을 추가할 때 어느 플랫폼인지 고르면 그 플랫폼의 네이티브 컬럼명으로 읽는다.
 *
 * 이 컴포넌트 자체는 "지금 어느 단계를 보여줄지"만 결정하는 얇은 조율자다. 실제 상태와 로직은
 * lib/useUploadBatch.js 커스텀 훅에 있고, 화면 4개(파일 선택 / 캠페인-제품 매칭 / 마진율 입력 /
 * 완료)는 각각 별도 컴포넌트(components/upload/ 폴더)로 나눠뒀다 — 예전엔 이 파일 하나가
 * 435줄에 상태 13개를 전부 가지고 있었는데, 역할별로 쪼개서 각 파일이 훨씬 짧아졌다.
 */
export default function UploadPanel({ onUploaded, startOpen = false }) {
  // 빈 화면에서는 처음부터 펼쳐서 보여준다 — 거기선 이게 유일한 시작점이다.
  const [open, setOpen] = useState(startOpen);
  const batch = useUploadBatch({ onUploaded });

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
        {!startOpen && (
          <button type="button" className="ghost" onClick={() => { setOpen(false); batch.resetPanel(); }}>
            닫기
          </button>
        )}
      </div>

      {batch.status === 'done' ? (
        <UploadDoneStep shareUrl={batch.shareUrl} />
      ) : batch.step === 'matching' ? (
        <MatchStep
          pendingBatch={batch.pendingBatch}
          campaignProduct={batch.campaignProduct}
          onCampaignProduct={batch.setCampaignProductFor}
          productList={batch.productList}
          fileError={batch.fileError}
          onCancel={batch.cancelBatch}
          onNext={batch.goToMargin}
        />
      ) : batch.step === 'margin' ? (
        <MarginStep
          productMargin={batch.productMargin}
          onMargin={batch.setMarginFor}
          fileError={batch.fileError}
          onBack={batch.backToMatching}
          onConfirm={batch.confirmBatch}
        />
      ) : (
        <UploadQueueStep
          platform={batch.platform}
          onPlatform={batch.setPlatform}
          onAddFiles={batch.addFiles}
          fileQueue={batch.fileQueue}
          onQueuePlatform={batch.setQueueFilePlatform}
          onRemoveFromQueue={batch.removeFromQueue}
          onStartBatch={batch.startBatch}
          batches={batch.batches}
          onRemoveBatch={batch.removeBatch}
          totalRows={batch.totalRows}
          fileError={batch.fileError}
          status={batch.status}
          uploadError={batch.uploadError}
          onUpload={batch.upload}
        />
      )}
    </div>
  );
}

UploadPanel.propTypes = {
  onUploaded: PropTypes.func.isRequired,
  startOpen: PropTypes.bool,
};
