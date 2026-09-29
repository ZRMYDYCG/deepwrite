declare module "virtual:deepwrite-locale-resources" {
  const resources: Record<"zh-CN" | "en-US", { url: string; schema: string }>;
  export default resources;
}
