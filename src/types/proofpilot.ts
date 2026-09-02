export type RazorpayDisputeStatus = "open" | "under_review" | "won" | "lost" | "closed";

export type ProofPilotPacketStatus =
  | "draft"
  | "approved"
  | "escalated"
  | "accepted"
  | "contested"
  | "closed";

export interface RazorpayEvidenceFile {
  file_name: string;
  mime_type?: string;
  size_bytes?: number;
  storage_provider?: string;
  storage_status?: string;
  storage_key?: string;
  uploaded_at?: string;
  download_url?: string;
  razorpay_document_id?: string;
}

export interface ProofPilotCase {
  case_id: string;
  dispute_id: string;
  payment_id: string;
  order_id: string;
  amount: number;
  currency: string;
  amount_deducted: number;
  reason_code: string;
  reason_description: string;
  respond_by: string;
  status: RazorpayDisputeStatus;
  packet_status: ProofPilotPacketStatus;
  customer_name: string;
  customer_email?: string;
  risk_score: number;
  readiness_score: number;
  confidence_score: number;
  evidence_files: Record<string, RazorpayEvidenceFile>;
}
