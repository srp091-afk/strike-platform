export type SourceEntity = {
  externalId: string;
  name: string;
  phone: string;
  email: string;
  telegram: string;
  context: string;
  payload: Record<string, string>;
};

export type PostAction = {
  add_note?: boolean;
  move_stage_id?: string;
  deal_id?: string;
  note?: string;
};

export type AdapterResult = { ok: true; detail: string } | { ok: false; error: string };

export interface DataSourceAdapter {
  testConnection(config: Record<string, unknown>): Promise<AdapterResult>;
  fetchEntities(config: Record<string, unknown>): Promise<SourceEntity[]>;
  executePostAction(config: Record<string, unknown>, action: PostAction, sent: { message: string; contact: string }): Promise<void>;
}
