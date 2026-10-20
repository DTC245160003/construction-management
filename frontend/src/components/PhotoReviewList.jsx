import { Notice } from "./OperationsUI";

const confidenceLabels = { none: "Chưa có dấu hiệu nghi vấn", low: "Thấp", medium: "Trung bình" };
export default function PhotoReviewList({ reviews = [] }) {
  if (!reviews.length) return null;
  return <section aria-label="Đối chiếu bằng chứng ảnh">
    <h3>Đối chiếu bằng chứng ảnh</h3>
    <p className="ops-muted">Các dấu hiệu metadata hỗ trợ người duyệt kiểm tra, không phải kết luận ảnh giả.</p>
    {reviews.map((review) => <div key={review.photo_id} className="ops-card" style={{ marginBottom: 12 }}>
      <strong>{review.filename || `Ảnh #${review.photo_id}`}</strong>
      <p>Độ tin cậy của dấu hiệu: {confidenceLabels[review.confidence_level] || "Chưa xác định"}
        {review.distance_m != null && <> · Cách tâm công trường {Math.round(review.distance_m).toLocaleString("vi-VN")} m</>}
        {review.outside_site === true && <> · Ngoài bán kính công trường</>}
      </p>
      {(review.reasons || []).map((reason, index) => <Notice key={`${reason.code}-${index}`} tone={reason.severity === "warning" ? "warning" : "info"}>{reason.message}</Notice>)}
    </div>)}
  </section>;
}
