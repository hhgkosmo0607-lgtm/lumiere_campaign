/**
 * 이 파일이 앱 전체의 시작점이다. index.html의 <div id="root"></div> 자리에
 * React 컴포넌트 트리를 처음 꽂아 넣는(mount) 딱 한 곳이다.
 *
 * 조립 순서(안에서 바깥으로 읽는다): App(실제 화면) → ErrorBoundary(화면이 깨지면
 * 흰 페이지 대신 안내 문구를 보여주는 안전망) → React.StrictMode(개발 중에만 버그를
 * 잡기 쉽게 일부러 함수를 두 번씩 실행해보는 개발용 도우미. 배포 결과물엔 영향 없다).
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
