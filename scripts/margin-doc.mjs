/**
 * 업로드할 때 손으로 입력해야 하는 마진율을 폴더마다 적어둔다.
 *
 * 플랫폼 리포트에는 원가 정보가 없어서(플랫폼은 원가를 모른다) 마진율은 사람이 넣어야 하는데,
 * 시연할 때마다 생성 스크립트를 열어보는 건 번거롭다. 그래서 각 native 폴더에 마진율.md를 남긴다.
 * 확장자가 .md라 업로드 파일 선택창(.xlsx/.csv만 받음)에는 뜨지 않는다.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export function writeMarginDoc(dir, { brand, industry, products, campaigns, test }) {
  const rows = products
    .map((p) => `| ${p.name} | ${Math.round(p.margin * 100)} | ${(100 / p.margin).toFixed(0)}% |`)
    .join('\n');

  // 캠페인명은 채널마다 다르다(예: 트렌치코트_검색 / _피드 / _비즈보드). 제품마다 전부 보여준다.
  const byProduct = new Map();
  for (const [campaign, product] of campaigns ?? []) {
    if (!byProduct.has(product)) byProduct.set(product, new Set());
    byProduct.get(product).add(campaign);
  }
  const campaignRows = byProduct.size
    ? '\n## 캠페인명 → 제품\n\n업로드하면 캠페인마다 어느 제품인지 물어봅니다. 대개 자동으로 채워지지만, 틀렸으면 이 표를 보고 고치면 됩니다. 채널마다 캠페인 이름이 다릅니다.\n\n| 제품 | 캠페인명 (채널별) |\n|---|---|\n'
      + [...byProduct].map(([product, set]) => `| ${product} | ${[...set].join(' · ')} |`).join('\n') + '\n'
    : '';

  const body = `# ${brand} — ${industry}

업로드하면 **제품별로 마진율을 한 번씩** 입력받습니다. 이 표를 보고 그대로 넣으면 됩니다.
입력창에는 퍼센트 숫자만 넣습니다 (예: 48).

| 제품 | 입력할 마진율 | 손익분기 ROAS |
|---|---|---|
${rows}

손익분기 ROAS는 \`1 ÷ 마진율\`입니다. **이 값을 넘겨야 실제로 이익이 남습니다** — 화면의 붉은 기준선이 여기로 옮겨갑니다. 마진율을 비워두면 이익·ROI 계산이 꺼지고 기준선은 100%가 됩니다.
${campaignRows}${test ? `\n## 이 폴더로 확인하는 것\n\n${test}\n` : ''}`;

  writeFileSync(path.join(dir, '마진율.md'), body, 'utf-8');
}
