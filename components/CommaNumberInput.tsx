'use client';

import React, { useState, useEffect } from 'react';

/**
 * 천단위 콤마를 입력 중에도 표시하는 숫자 입력.
 * <input type="number"> 는 콤마를 허용하지 않으므로 type="text"(inputMode=numeric)로
 * 정수만 받아 콤마 포맷하고, onChange 로는 숫자값을 넘긴다.
 * 외부에서 value 가 바뀌면(자동채움 등) 표시도 동기화한다.
 * (금액·수량 등 정수 필드 전용 — 비율·소수 필드에는 쓰지 않는다)
 */
export default function CommaNumberInput({
  value, onChange, style, placeholder, allowEmpty = false,
}: {
  value: number;
  onChange: (n: number) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  allowEmpty?: boolean;   // 빈 값을 0 대신 빈 문자열로 표시
}) {
  const fmt = (n: number) => (allowEmpty && n === 0 ? '' : n.toLocaleString('ko-KR'));
  const [text, setText] = useState(fmt(value));

  // 외부 value 변경 동기화 (입력 중이 아닌 값 변경만 반영)
  useEffect(() => {
    const parsed = Number(text.replace(/[^0-9]/g, '')) || 0;
    if (parsed !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        const n = raw ? Number(raw) : 0;
        setText(raw ? n.toLocaleString('ko-KR') : '');
        onChange(n);
      }}
      style={style}
      placeholder={placeholder}
    />
  );
}
