"use client";
// Links into the key-holding pages (/app, /launch) must land in a document served with the strict nonce CSP.
// CSP belongs to the first-loaded document, so from a static-CSP page (tracker, landing) we do a full load.
import Link from "next/link";

const STRICT = /^\/(app|launch|dev)(\/|$)/;
// evaluated once, on the first load of this document
const strictDocument = typeof window !== "undefined" && STRICT.test(window.location.pathname);

export default function AppLink({ href, children, ...rest }: React.ComponentProps<typeof Link> & { href: string }) {
  if (STRICT.test(href.split("?")[0]) && !strictDocument) return <a href={href} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>;
  return <Link href={href} {...rest}>{children}</Link>;
}
