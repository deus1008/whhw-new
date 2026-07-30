-- 오류신고 인앱 회신: 신고자가 관리자 조치결과를 아직 확인하지 않았는지 표시
-- 기본값 true(기존 신고는 소급 배지 방지). 관리자가 조치결과를 저장하면 false로 바뀌어
-- 신고자 화면에 '새 조치' 배지가 뜨고, 신고자가 내 신고함을 열면 다시 true가 된다.
ALTER TABLE public.error_reports
  ADD COLUMN IF NOT EXISTS reporter_seen boolean NOT NULL DEFAULT true;
