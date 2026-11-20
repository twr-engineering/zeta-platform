/* eslint-disable @next/next/no-img-element -- fixed-size theme pair; next/image adds nothing here */
/** The theme-aware Zeta logo pair (app PRD §10.7): one shows at a time, 118×32. */
export function Logo() {
  return (
    <>
      <img className="logo-light" src="/zeta-logo-light.png" width={118} height={32} alt="Zeta" />
      <img className="logo-dark" src="/zeta-logo-dark.png" width={118} height={32} alt="Zeta" />
    </>
  )
}
