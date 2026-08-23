import { Component } from 'react';
import PropTypes from 'prop-types';
import Masthead from './Masthead.jsx';

/**
 * 화면을 그리는 중 오류가 나면 React는 아무것도 안 그린다 — 사용자에겐 흰 페이지로 보인다.
 * 그때 사이트가 죽은 게 아니라는 걸 알려주고, 무엇을 하면 되는지 안내한다.
 *
 * 이 파일만 유일하게 함수가 아니라 클래스(class)로 만든 컴포넌트다. "자식 컴포넌트에서 발생한
 * 오류를 붙잡는" 기능(getDerivedStateFromError, componentDidCatch)은 React에서 클래스
 * 컴포넌트로만 만들 수 있다 — 함수형 컴포넌트에 이 기능을 대신하는 훅이 아직 없다. 그래서
 * 이 프로젝트의 다른 모든 컴포넌트는 함수형이지만, 이 컴포넌트만 예외적으로 클래스형이다.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // 원인은 개발자 도구 콘솔에 남긴다 (화면에는 내부 오류 문구를 보여주지 않는다).
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="shell">
        <Masthead />
        <p className="state">
          화면을 그리는 중 문제가 생겼습니다. 새로고침해 주세요.
          <br />
          업로드한 데이터를 보고 계셨다면 링크는 그대로 살아 있으니 다시 열면 됩니다.
        </p>
      </div>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};
