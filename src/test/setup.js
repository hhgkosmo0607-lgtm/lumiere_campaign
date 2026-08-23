// vitest가 모든 테스트 파일 실행 전에 한 번 불러온다. jest-dom의 커스텀 매처
// (toBeInTheDocument, toHaveTextContent 등)를 vitest의 expect에 등록해준다.
import '@testing-library/jest-dom/vitest';

// jsdom(테스트 환경)이 File/Blob의 .text() 메서드를 구현하지 않는다 — 실제 브라우저는
// 다 지원하니 배포된 앱은 문제없지만, 테스트에서 file.text()를 쓰는 코드(parseExcel.js·
// importSavedCsv.js)를 실제로 돌려보려면 테스트 환경에만 채워 넣어야 한다.
// FileReader는 jsdom이 지원하므로, 그걸로 .text()를 흉내 낸다.
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function text() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
