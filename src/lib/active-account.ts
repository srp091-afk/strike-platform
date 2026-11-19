let header = "";

export type ClientAccount = {
  id: string;
  name: string;
  email: string;
};

export function setActiveAccountHeader(accountId: string) {
  header = accountId;
}

export function activeAccountHeader() {
  return header;
}
