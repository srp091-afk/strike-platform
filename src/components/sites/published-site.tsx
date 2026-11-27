import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";

import { LandingView } from "@/components/landing-view";
import { QuizRunner } from "@/components/sites/quiz-runner";
import { getLanding } from "@/lib/landings";
import type { SiteRecord } from "@/lib/sites/store";

export function siteMetadata(site: SiteRecord | null): Metadata {
  if (!site) return { title: "Сайт" };
  return {
    title: site.seo.title || site.title,
    description: site.seo.description || site.subtitle,
    openGraph: site.seo.ogImageUrl ? { images: [site.seo.ogImageUrl] } : undefined,
  };
}

export function PublishedSite({ site, live }: { site: SiteRecord; live: boolean }) {
  if (!live || site.status === "paused") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fafafa] px-6 text-center text-[#09090b]">
        <div>
          <h1 className="text-3xl font-semibold"><span>{site.status === "paused" ? "Сайт на паузе" : "Скоро откроется"}</span></h1>
          <p className="mt-3 text-sm text-[#52525b]"><span>{site.title}</span></p>
        </div>
      </main>
    );
  }
  if (site.siteType === "quiz" && site.published) {
    return (
      <>
        <Pixels site={site} />
        <QuizRunner schema={site.published} theme={site.theme} siteId={site.id} live />
      </>
    );
  }
  if (site.siteType === "landing") return <LandingBridge id={site.id} />;
  notFound();
}

function Pixels({ site }: { site: SiteRecord }) {
  const { metaPixelId, ga4Id, yandexMetrikaId } = site.analytics;
  return (
    <>
      {safeId(metaPixelId) ? <Script id="meta-pixel">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${safeId(metaPixelId)}');fbq('track','PageView');`}</Script> : null}
      {safeId(ga4Id) ? <Script src={`https://www.googletagmanager.com/gtag/js?id=${safeId(ga4Id)}`} /> : null}
      {safeId(ga4Id) ? <Script id="ga4">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${safeId(ga4Id)}');`}</Script> : null}
      {safeId(yandexMetrikaId) ? <Script id="ym" data-metrika={safeId(yandexMetrikaId)}>{`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');ym(${Number(safeId(yandexMetrikaId))},'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true});`}</Script> : null}
    </>
  );
}

function safeId(value: string) {
  return /^[A-Za-z0-9_-]{2,40}$/.test(value) ? value : "";
}

async function LandingBridge({ id }: { id: string }) {
  const landing = await getLanding(id);
  if (!landing) notFound();
  return (
    <main className="min-h-screen" style={{ background: landing.document.theme.background }}>
      <LandingView landing={landing} />
    </main>
  );
}
