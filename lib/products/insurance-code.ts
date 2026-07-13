// 대표코드(13자리) → 보험코드(9자리) 변환
//
// 위탁품목리스트의 대표코드는 13자리 숫자이며, 앞 3자리와 맨 뒷자리 1자리를
// 제외한 가운데 9자리가 식약처/심평원에서 쓰는 보험코드(청구코드)이다.
//   예) 8806540000201 → 654000020
// 식약처 API가 반환하는 9자리 보험코드와 동일하다.

/** 대표코드(또는 임의 코드 문자열)에서 9자리 보험코드를 추출한다. 추출 불가 시 원본 숫자열 반환. */
export function toInsuranceCode(rep: string | null | undefined): string {
  const digits = String(rep ?? '').replace(/\D/g, '');
  if (digits.length === 9)  return digits;              // 이미 보험코드
  // 880(국가코드) 프리픽스 제거 후 9자리가 보험코드. 13자리는 끝의 체크숫자를 자연히 제외,
  // 12자리(체크숫자 없는 케이스)도 동일하게 9자리 추출됨.
  if (digits.length >= 12) return digits.slice(3, 12);
  if (digits.length > 3)   return digits.slice(3);      // 그 외: 프리픽스만 제거
  return digits;
}
