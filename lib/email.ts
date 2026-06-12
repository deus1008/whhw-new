import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.RESEND_FROM_EMAIL ?? 'noreply@whhw.co.kr';

const STATUS_KO: Record<string, string> = {
  '접수':  '접수됨',
  '처리중': '처리 중',
  '완료':  '처리 완료',
};

export async function sendErrorReportReply(opts: {
  to:           string;
  reportTitle:  string;
  reportContent: string;
  status:       string;
  adminComment: string;
}): Promise<boolean> {
  const { to, reportTitle, reportContent, status, adminComment } = opts;
  const statusLabel = STATUS_KO[status] ?? status;
  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- 헤더 -->
    <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:28px 32px;">
      <div style="font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:0.05em;">CSO Biz.</div>
      <div style="font-size:20px;font-weight:800;color:#fff;margin-top:6px;">오류 신고 처리 결과</div>
    </div>

    <!-- 상태 배지 -->
    <div style="padding:24px 32px 0;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 16px;border-radius:100px;font-size:13px;font-weight:700;
            background:${status === '완료' ? '#dcfce7' : status === '처리중' ? '#fef9c3' : '#fee2e2'};
            color:${status === '완료' ? '#16a34a' : status === '처리중' ? '#ca8a04' : '#dc2626'};">
            ${statusLabel}
          </td>
        </tr>
      </table>
    </div>

    <!-- 본문 -->
    <div style="padding:20px 32px 28px;">
      <div style="font-size:17px;font-weight:700;color:#0f172a;margin-bottom:6px;">${reportTitle}</div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:20px;">${now} 처리</div>

      <!-- 조치 결과 -->
      <div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;padding:16px 18px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:#6366f1;letter-spacing:0.06em;margin-bottom:8px;">조치 결과</div>
        <div style="font-size:14px;color:#1e293b;line-height:1.7;white-space:pre-wrap;">${adminComment}</div>
      </div>

      <!-- 원본 신고 내용 -->
      <div style="background:#f8fafc;border-radius:8px;padding:16px 18px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;margin-bottom:8px;">신고 내용 (원본)</div>
        <div style="font-size:13px;color:#475569;line-height:1.65;white-space:pre-wrap;">${reportContent}</div>
      </div>
    </div>

    <!-- 푸터 -->
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      이 메일은 CSO Biz. 시스템에서 자동 발송되었습니다. &nbsp;|&nbsp; © 2026 판매대행사업
    </div>
  </div>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from:    FROM,
      to,
      subject: `[CSO Biz] 오류 신고 처리 결과: ${reportTitle}`,
      html,
    });
    if (error) { console.error('[sendErrorReportReply]', error); return false; }
    return true;
  } catch (e) {
    console.error('[sendErrorReportReply] exception:', e);
    return false;
  }
}
