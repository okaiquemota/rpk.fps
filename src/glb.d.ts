/** Os `.glb` entram pelo Vite como URL (data URI, por causa do inline). */
declare module '*.glb?url' {
  const url: string;
  export default url;
}
