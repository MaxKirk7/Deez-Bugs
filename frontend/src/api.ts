export type CategorySummary = {
  app_category?: string;
  category?: string;
  total: number;
  transaction_count: number;
};

export type ModelUser = {
  user_id: string | number;
  segment: number;
  segment_size: number;
  similar_users: Array<{ user_id: string | number; similarity: number }>;
  recommendations: Array<{
    merchant: string;
    score: number;
    similar_users: number;
    category: string | null;
    average_amount: number;
    distance_km: number | null;
    cheaper_than_user: boolean;
    estimated_savings: number;
  }>;
};

export type Analysis = {
  transaction_count: number;
  user_count: number;
  total_spend: number;
  average_transaction: number;
  by_category: CategorySummary[];
  by_month: Array<{ month: string; total: number; transaction_count: number }>;
  by_hour: Array<{ hour: number; total: number; transaction_count: number }>;
  by_weekday: Array<{ day_of_week_number: number; day_of_week: string; total: number; transaction_count: number }>;
  location?: {
    spend_locations: Array<{
      merchant_latitude: number;
      merchant_longitude: number;
      merchant: string;
      total: number;
      transaction_count: number;
    }>;
    unique_location_count: number;
  };
  model: {
    status: string;
    users?: ModelUser[];
  };
};

export async function uploadCsv(file: File): Promise<Analysis> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/upload-csv/", {
    method: "POST",
    body,
  });
  const payload = (await response.json()) as
    | { analysis: Analysis }
    | { detail: string };
  if (!response.ok || !("analysis" in payload)) {
    throw new Error("detail" in payload ? payload.detail : "Upload failed");
  }
  return payload.analysis;
}
