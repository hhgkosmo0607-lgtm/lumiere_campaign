import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useUploadBatch from '../useUploadBatch.js';

/**
 * useUploadBatch는 업로드 화면 전체의 흐름(파일 선택 → 캠페인-제품 매칭 → 마진율
 * 입력 → 업로드)을 담당하는, 이 앱에서 상태가 가장 복잡하게 얽힌 곳이다. 실제 엑셀
 * 파싱(parsePlatformFile)과 서버 저장(createUpload)은 여기서 검사할 대상이 아니라서
 * — 그건 각각 parseExcel.js·uploadFirestore.js 몫이다 — 가짜(mock)로 바꿔치기하고,
 * "그 결과를 받아서 상태를 올바르게 바꾸는가"만 확인한다.
 */
vi.mock('../parseExcel.js', () => ({
  parsePlatformFile: vi.fn(),
}));
vi.mock('../uploadFirestore.js', () => ({
  createUpload: vi.fn(),
}));

import { parsePlatformFile } from '../parseExcel.js';
import { createUpload } from '../uploadFirestore.js';

const fakeFile = (name) => new File(['x'], name);

// parsePlatformFile이 항상 이 모양의 결과를 돌려주게 만드는 헬퍼.
// 캠페인 2개(제품 후보 다름), 각각 1행씩.
const parsedRows = () => [
  { date: '2026-01-01', platform: 'naver', campaign: '세럼_검색_브랜드', adGroup: 'a', impressions: 100, clicks: 10, adSpend: 1000, conversions: 1, revenue: 2000 },
  { date: '2026-01-01', platform: 'naver', campaign: '크림_인스타', adGroup: 'a', impressions: 50, clicks: 5, adSpend: 500, conversions: 0, revenue: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  parsePlatformFile.mockResolvedValue({ ok: true, rows: parsedRows() });
  createUpload.mockResolvedValue('fake-upload-id');
});

describe('파일 선택 대기열', () => {
  it('addFiles로 넣은 파일은 지금 고른 플랫폼이 같이 붙는다', () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    act(() => result.current.setPlatform('meta'));
    act(() => result.current.addFiles([fakeFile('a.xlsx')]));
    expect(result.current.fileQueue).toEqual([{ file: expect.anything(), platform: 'meta' }]);
  });

  it('setQueueFilePlatform은 그 파일 하나의 플랫폼만 바꾼다', () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    act(() => result.current.addFiles([fakeFile('a.xlsx'), fakeFile('b.xlsx')]));
    act(() => result.current.setQueueFilePlatform(1, 'kakao'));
    expect(result.current.fileQueue[0].platform).not.toBe('kakao');
    expect(result.current.fileQueue[1].platform).toBe('kakao');
  });

  it('removeFromQueue로 뺀 파일은 목록에서 사라진다', () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    act(() => result.current.addFiles([fakeFile('a.xlsx'), fakeFile('b.xlsx')]));
    act(() => result.current.removeFromQueue(0));
    expect(result.current.fileQueue).toHaveLength(1);
    expect(result.current.fileQueue[0].file.name).toBe('b.xlsx');
  });
});

describe('캠페인→제품 매칭 단계(startBatch)', () => {
  it('파일을 파싱해서 캠페인마다 제품을 자동 추측하고 matching 단계로 넘어간다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    act(() => result.current.addFiles([fakeFile('a.xlsx')]));
    await act(async () => result.current.startBatch());

    expect(result.current.step).toBe('matching');
    expect(result.current.pendingBatch.campaigns).toHaveLength(2);
    // guessProduct가 알려진 제품이 없을 때 흔한 단어를 걷어낸 나머지를 후보로 채운다
    const guesses = Object.values(result.current.campaignProduct);
    expect(guesses).toContain('세럼');
    expect(guesses).toContain('크림');
  });

  it('파싱이 실패하면 매칭 단계로 안 넘어가고 에러만 남긴다', async () => {
    parsePlatformFile.mockResolvedValueOnce({ ok: false, error: '없는 컬럼: 광고비' });
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    act(() => result.current.addFiles([fakeFile('bad.xlsx')]));
    await act(async () => result.current.startBatch());

    expect(result.current.step).toBeNull();
    expect(result.current.fileError).toContain('없는 컬럼');
    // 실패했으니 대기열은 그대로 남아 있어야 한다(사용자가 다시 시도할 수 있게)
    expect(result.current.fileQueue).toHaveLength(1);
  });
});

describe('마진율 단계(margin)', () => {
  async function toMarginStep(result) {
    act(() => result.current.addFiles([fakeFile('a.xlsx')]));
    await act(async () => result.current.startBatch());
    act(() => result.current.goToMargin());
  }

  it('goToMargin은 매칭된 고유 제품별로 입력칸을 하나씩 만든다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    await toMarginStep(result);
    expect(result.current.step).toBe('margin');
    expect(Object.keys(result.current.productMargin).sort()).toEqual(['세럼', '크림']);
  });

  it('마진율이 0~100 범위를 벗어나면 confirmBatch가 거부한다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    await toMarginStep(result);
    act(() => result.current.setMarginFor('세럼', '150'));
    act(() => result.current.confirmBatch());
    expect(result.current.fileError).toContain('세럼');
    expect(result.current.step).toBe('margin'); // 단계가 안 넘어가야 한다
  });

  it('마진율을 비워두면(입력 안 함) 통과한다 — margin은 null로 저장된다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    await toMarginStep(result);
    act(() => result.current.confirmBatch());
    expect(result.current.step).toBeNull(); // 배치로 확정되며 단계가 끝난다
    expect(result.current.batches).toHaveLength(1);
    expect(result.current.batches[0].rows.every((r) => r.margin === null)).toBe(true);
  });

  it('confirmBatch가 끝나면 캠페인이 파일 단위로 다시 나뉘어 batches에 쌓인다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    await toMarginStep(result);
    act(() => result.current.setMarginFor('세럼', '55'));
    act(() => result.current.confirmBatch());

    const [batch] = result.current.batches;
    expect(batch.rows).toHaveLength(2); // 원래 파일의 행 수 그대로
    const 세럼행 = batch.rows.find((r) => r.product === '세럼');
    expect(세럼행.margin).toBeCloseTo(0.55);
  });

  it('backToMatching으로 돌아가면 입력해둔 제품 매칭은 그대로 남아있다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    await toMarginStep(result);
    const before = { ...result.current.campaignProduct };
    act(() => result.current.backToMatching());
    expect(result.current.step).toBe('matching');
    expect(result.current.campaignProduct).toEqual(before);
  });

  it('cancelBatch는 매칭·마진 입력을 전부 버리고 원래 화면으로 돌린다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    await toMarginStep(result);
    act(() => result.current.cancelBatch());
    expect(result.current.step).toBeNull();
    expect(result.current.pendingBatch).toBeNull();
    expect(result.current.batches).toHaveLength(0); // 확정 전이라 배치엔 아무것도 안 남는다
  });
});

describe('알고 있는 제품 재사용 — 두 번째 배치부터 자동 매칭이 좋아진다', () => {
  it('이전 배치에서 확정한 제품명은 다음 배치의 자동 추측에 쓰인다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    // 첫 배치: 세럼/크림 확정
    act(() => result.current.addFiles([fakeFile('a.xlsx')]));
    await act(async () => result.current.startBatch());
    act(() => result.current.goToMargin());
    act(() => result.current.confirmBatch());

    // 두 번째 배치: 캠페인명이 "세럼_리타겟팅"처럼 다르게 지어져도 알고 있는 "세럼"으로 매칭돼야 한다
    parsePlatformFile.mockResolvedValueOnce({
      ok: true,
      rows: [{ date: '2026-01-02', platform: 'google', campaign: '세럼_리타겟팅', adGroup: 'a', impressions: 10, clicks: 1, adSpend: 100, conversions: 0, revenue: 0 }],
    });
    act(() => result.current.addFiles([fakeFile('b.xlsx')]));
    await act(async () => result.current.startBatch());

    const guess = Object.values(result.current.campaignProduct)[0];
    expect(guess).toBe('세럼');
  });
});

describe('배치 목록 관리', () => {
  it('removeBatch로 뺀 배치는 totalRows 계산에서도 빠진다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    act(() => result.current.addFiles([fakeFile('a.xlsx')]));
    await act(async () => result.current.startBatch());
    act(() => result.current.goToMargin());
    act(() => result.current.confirmBatch());
    expect(result.current.totalRows).toBe(2);

    act(() => result.current.removeBatch(0));
    expect(result.current.batches).toHaveLength(0);
    expect(result.current.totalRows).toBe(0);
  });
});

describe('업로드', () => {
  async function withOneBatch(onUploaded) {
    const { result } = renderHook(() => useUploadBatch({ onUploaded }));
    act(() => result.current.addFiles([fakeFile('a.xlsx')]));
    await act(async () => result.current.startBatch());
    act(() => result.current.goToMargin());
    act(() => result.current.confirmBatch());
    return result;
  }

  it('성공하면 createUpload를 부르고 onUploaded 콜백에 합쳐진 행을 넘긴다', async () => {
    const onUploaded = vi.fn();
    const result = await withOneBatch(onUploaded);
    await act(async () => result.current.upload());

    expect(createUpload).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('done');
    expect(result.current.shareUrl).toContain('fake-upload-id');
    expect(onUploaded).toHaveBeenCalledWith(expect.any(Array), expect.any(Array));
  });

  it('서버 저장이 실패하면 status가 error가 되고 이유를 남긴다', async () => {
    createUpload.mockRejectedValueOnce(new Error('네트워크 오류'));
    const result = await withOneBatch(vi.fn());
    await act(async () => result.current.upload());

    expect(result.current.status).toBe('error');
    expect(result.current.uploadError).toBe('네트워크 오류');
  });

  it('MAX_UPLOAD_ROWS를 넘으면 createUpload를 부르지도 않고 안내만 한다', async () => {
    // 행이 3,000개를 넘도록 파싱 결과를 부풀린다
    const manyRows = Array.from({ length: 3001 }, () => ({
      date: '2026-01-01', platform: 'naver', campaign: '세럼', adGroup: 'a',
      impressions: 1, clicks: 1, adSpend: 1, conversions: 0, revenue: 0,
    }));
    parsePlatformFile.mockResolvedValueOnce({ ok: true, rows: manyRows });

    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    act(() => result.current.addFiles([fakeFile('big.xlsx')]));
    await act(async () => result.current.startBatch());
    act(() => result.current.goToMargin());
    act(() => result.current.confirmBatch());

    await act(async () => result.current.upload());

    expect(createUpload).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.uploadError).toContain('3,000');
  });
});

describe('resetPanel', () => {
  it('모든 상태를 초기값으로 되돌린다', async () => {
    const { result } = renderHook(() => useUploadBatch({ onUploaded: vi.fn() }));
    act(() => result.current.addFiles([fakeFile('a.xlsx')]));
    await act(async () => result.current.startBatch());
    act(() => result.current.goToMargin());
    act(() => result.current.confirmBatch());

    act(() => result.current.resetPanel());

    expect(result.current.batches).toHaveLength(0);
    expect(result.current.fileQueue).toHaveLength(0);
    expect(result.current.step).toBeNull();
    expect(result.current.status).toBe('idle');
  });
});
