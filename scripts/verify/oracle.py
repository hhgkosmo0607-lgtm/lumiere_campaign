# 프로젝트 코드를 하나도 쓰지 않고, 엑셀 파일에서 직접 값을 읽어 지표를 계산한다.
# (xlsx는 XML을 압축한 zip이라 파이썬 표준 라이브러리만으로 열 수 있다)
#
# 이게 왜 필요한가: 앱 안에서만 검사하면 계산식이 틀려도 "일관되게 틀린" 상태를 그대로 통과시킨다.
# 전혀 다른 방법으로 낸 값과 대조해야 진짜 검증이 된다. scripts/verify.mjs가 이 파일을 호출한다.
#
# 실행: python3 scripts/verify/oracle.py <폴더> '<제품별 마진율 JSON>'
import zipfile, sys, json, datetime
from xml.etree import ElementTree as ET
from pathlib import Path

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# 각 플랫폼 리포트의 컬럼 이름 → 뜻. 문서를 보고 사람이 직접 적은 것으로,
# 일부러 src/lib/platforms.js에서 가져오지 않는다 (그걸 쓰면 같은 실수를 함께 하게 된다).
COLUMN_MEANING = {
    '날짜': 'date', 'Date': 'date', 'Day': 'date',
    '캠페인': 'campaign', '캠페인 이름': 'campaign', 'Campaign name': 'campaign',
    '노출수': 'imp', 'Impr.': 'imp', 'Impressions': 'imp',
    '클릭수': 'clk', 'Clicks': 'clk', 'Link clicks': 'clk',
    '광고비': 'cost', '비용': 'cost', 'Cost': 'cost', 'Amount spent': 'cost',
    '구매완료 전환수': 'cv', '구매': 'cv', 'Conversions': 'cv', 'Purchases': 'cv',
    '구매완료 전환매출액': 'rev', '구매금액': 'rev',
    'Conversion value': 'rev', 'Purchase conversion value': 'rev',
}


def read_sheet(path):
    """xlsx의 첫 시트를 셀 주소(A1 형식)의 열 문자 → 값 딕셔너리 목록으로 읽는다."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(f'{NS}si'):
                shared.append(''.join(t.text or '' for t in si.iter(f'{NS}t')))
        rows = []
        for r in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter(f'{NS}row'):
            cells = {}
            for c in r.findall(f'{NS}c'):
                col = ''.join(ch for ch in c.get('r') if ch.isalpha())
                v = c.find(f'{NS}v')
                if v is None:
                    inline = c.find(f'{NS}is')
                    cells[col] = ''.join(t.text or '' for t in inline.iter(f'{NS}t')) if inline is not None else ''
                elif c.get('t') == 's':
                    cells[col] = shared[int(v.text)]
                else:
                    cells[col] = v.text
            rows.append(cells)
        return rows


def parse(path):
    raw = read_sheet(path)
    header = raw[0]
    cols = sorted(header.keys(), key=lambda k: (len(k), k))
    names = [header[c] for c in cols]
    return [dict(zip(names, [r.get(c, '') for c in cols])) for r in raw[1:]]


def load(folder, margins):
    rows = []
    for f in sorted(Path(folder).glob('*.xlsx')):
        platform = f.stem.split('-')[-2]      # livdeco-google-native → google
        for rec in parse(f):
            row = {'platform': platform}
            for k, v in rec.items():
                key = COLUMN_MEANING.get(k)
                if key:
                    row[key] = v if key in ('date', 'campaign') else float(v or 0)
            rows.append(row)

    # 주차: 데이터 전체에서 가장 이른 날짜를 1주차로 놓고 7일 단위 (앱의 deriveWeeks와 같은 규칙)
    day0 = datetime.date.fromisoformat(min(r['date'] for r in rows))
    for r in rows:
        r['week'] = (datetime.date.fromisoformat(r['date']) - day0).days // 7 + 1
        r['product'] = r['campaign'].replace('[', '_').replace(']', '_').split('_')[0] or r['campaign']
        r['margin'] = margins.get(r['product'], 0.4)
    return rows


def calc(sub):
    """합계를 먼저 내고 나눈다. 비율의 평균이 아니다."""
    if not sub:
        return None
    cost = sum(r['cost'] for r in sub)
    rev = sum(r['rev'] for r in sub)
    imp = sum(r['imp'] for r in sub)
    clk = sum(r['clk'] for r in sub)
    cv = sum(r['cv'] for r in sub)
    cogs = sum(r['rev'] * (1 - r['margin']) for r in sub)
    profit = rev - cogs - cost
    return {
        'adSpend': cost, 'revenue': rev, 'impressions': imp, 'clicks': clk, 'conversions': cv,
        'ctr': clk / imp if imp else 0,
        'cvr': cv / clk if clk else 0,
        'cpc': cost / clk if clk else 0,
        'roas': rev / cost if cost else 0,
        'profit': profit,
        'roi': profit / cost if cost else 0,
        # 매출이 0이면 마진율을 알 길이 없다. 그때는 원가를 모를 때와 같이 100%를 쓴다
        # (앱의 aggregate()와 같은 규칙 — 손익분기선을 바닥에 그리면 안 되기 때문).
        'breakevenRoas': (1 / (1 - cogs / rev)) if rev and (1 - cogs / rev) > 0 else 1,
    }


if __name__ == '__main__':
    folder = sys.argv[1]
    margins = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    rows = load(folder, margins)

    out = {'rowCount': len(rows),
           'weeks': [min(r['week'] for r in rows), max(r['week'] for r in rows)],
           'all': calc(rows)}
    for p in sorted({r['platform'] for r in rows}):
        out[f'platform:{p}'] = calc([r for r in rows if r['platform'] == p])
    for p in sorted({r['product'] for r in rows}):
        out[f'product:{p}'] = calc([r for r in rows if r['product'] == p])
    # 채널 × 주차 — 주차별 그래프가 그리는 값. 데이터가 아예 없는 칸은 null로 둔다.
    for p in sorted({r['platform'] for r in rows}):
        for w in sorted({r['week'] for r in rows}):
            out[f'trend:{p}:{w}'] = calc([r for r in rows if r['platform'] == p and r['week'] == w])
    print(json.dumps(out, ensure_ascii=False))
