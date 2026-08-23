// vitest가 모든 테스트 파일 실행 전에 한 번 불러온다. jest-dom의 커스텀 매처
// (toBeInTheDocument, toHaveTextContent 등)를 vitest의 expect에 등록해준다.
import '@testing-library/jest-dom/vitest';
