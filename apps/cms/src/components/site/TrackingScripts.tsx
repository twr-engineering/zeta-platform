import Script from 'next/script'

import { GA_ID, PIXEL_ID, type Consent, type TrackingIds } from '@/lib/site/consent'

/**
 * FR-G10: optional tags, rendered only for accepted categories. IDs are validated against the
 * vendors' formats before they are interpolated into inline script.
 */
export function TrackingScripts({ ids, consent }: { ids: TrackingIds; consent: Consent | null }) {
  const ga = consent?.analytics && ids.gaMeasurementId && GA_ID.test(ids.gaMeasurementId) ? ids.gaMeasurementId : null
  const pixel = consent?.marketing && ids.metaPixelId && PIXEL_ID.test(ids.metaPixelId) ? ids.metaPixelId : null
  return (
    <>
      {ga && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
      {pixel && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
        </Script>
      )}
    </>
  )
}
