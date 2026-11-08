-- 기기별 비교용 무작위 기기 ID(브라우저 localStorage에 저장된 UUID, 개인정보와 무관).
-- 같은 통신사라도 요금제·기기마다 최고 속도가 달라서, /stats의 체감 단계는 "같은 기기의
-- 기숙사 밖 측정" 대비로만 계산한다. IP 해시는 모바일 IP가 안/밖에서 바뀌어 기기를 못 이어 준다.
-- 이 컬럼이 생기기 전 측정은 NULL이라 비교 대상에서 빠진다.
ALTER TABLE measurements ADD COLUMN device_id TEXT;
