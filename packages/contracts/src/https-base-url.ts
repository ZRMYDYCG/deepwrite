import { z } from "zod";

/** Service roots must not carry credentials, query strings or fragments. */
export const HttpsBaseUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "请填写不含密钥或查询参数的 HTTPS 接口地址。");
