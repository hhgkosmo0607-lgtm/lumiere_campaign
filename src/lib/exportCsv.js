/**
 * 지금 조건으로 걸러진 원본 데이터를 CSV 파일로 내려받는다.
 *
 * 화면 표는 50행씩 나눠 보여주지만 파일에는 걸러진 전체가 들어간다 — 받는 사람이
 * 엑셀에서 다시 피벗을 돌리거나 자기 보고서 양식에 붙이는 게 목적이기 때문이다.
 * 같은 이유로 CTR·ROAS는 "2.55%"가 아니라 0.0255처럼 계산 가능한 숫자로 넣는다
 * (엑셀에서 백분율 서식만 씌우면 화면과 같은 값이 된다).
 */
import { platformInfo } from './metrics.js';

// 값에 쉼표·따옴표·줄바꿈이 들어 있으면 따옴표로 감싸고, 안쪽 따옴표는 두 번 겹쳐 쓴다.
function cell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 비율은 소수점 이하가 길어지면 파일만 지저분해진다. 화면 표시(소수점 둘째 자리 %)보다
// 넉넉하게 남겨서 다시 계산해도 값이 어긋나지 않게 한다.
const ratio = (v) => (v == null ? '' : Math.round(v * 1e6) / 1e6);
const int = (v) => (v == null ? '' : Math.round(v));

export function buildCsv(rows, { platforms, showProduct, showRoi }) {
  const columns = [
    ['날짜', (r) => r.date],
    ['주차', (r) => r.week],
    ['채널', (r) => platformInfo(r.platform, platforms).name],
    ...(showProduct ? [['제품', (r) => r.product]] : []),
    ['광고비', (r) => int(r.adSpend)],
    ['노출수', (r) => int(r.impressions)],
    ['클릭수', (r) => int(r.clicks)],
    ['전환수', (r) => int(r.conversions)],
    ['매출', (r) => int(r.revenue)],
    ['CTR', (r) => ratio(r.ctr)],
    ['클릭단가', (r) => int(r.cpc)],
    ['전환율', (r) => ratio(r.cvr)],
    ['ROAS', (r) => ratio(r.roas)],
    ...(showRoi ? [['이익', (r) => int(r.profit)], ['ROI', (r) => ratio(r.roi)]] : []),
  ];

  const lines = [columns.map(([label]) => cell(label)).join(',')];
  for (const r of rows) {
    lines.push(columns.map(([, get]) => cell(get(r))).join(','));
  }
  return lines.join('\r\n');
}

// 조건을 파일명에 남긴다 — 여러 번 받아도 어떤 조건으로 뽑은 파일인지 구분되도록.
export function buildFileName({ platform, product, from, to, platforms }) {
  const parts = ['campaign-insight'];
  if (platform && platform !== 'all') parts.push(platformInfo(platform, platforms).name);
  if (product && product !== 'all') parts.push(product);
  parts.push(`${from}-${to}주`);
  parts.push(new Date().toISOString().slice(0, 10));
  // 파일명에 쓸 수 없는 문자를 걷어낸다
  return `${parts.join('_').replace(/[\\/:*?"<>|]/g, '')}.csv`;
}

export function downloadCsv(text, fileName) {
  // 맨 앞의 BOM이 없으면 엑셀이 CSV를 UTF-8로 안 읽어서 한글 컬럼명이 깨진다.
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
