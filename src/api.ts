import axios from "axios";

export function createAPI({ host, token }: { host: string; token: string }) {
  return axios.create({
    baseURL: `${host}/api`,
    headers: { Authorization: `Bearer ${token}` },
  });
}
