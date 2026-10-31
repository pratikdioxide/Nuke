"use client";
import { useEffect, useState } from "react";
import { thumbUrl } from "@/lib/client/shot";

type Props = {
  slug: string;
  /** When the saved screenshot was taken. null = none yet. */
  thumbAt: number | null;
  /** True while the screenshot is being taken right now. */
  capturing?: boolean;
  /** The last attempt to take a screenshot failed. */
  failed?: boolean;
  deployed?: boolean;
};

/** A saved screenshot of the site, loaded from the database as a plain image (the site itself is never framed here). */
export default function SiteThumbnail({ slug, thumbAt, capturing, failed, deployed = true }: Props) {
  const [broken, setBroken] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const imgKey = `${slug}:${thumbAt}`;
  const loaded = loadedKey === imgKey;
  useEffect(() => setBroken(false), [slug, thumbAt]);
  const showImg = thumbAt !== null && !broken;

  return (
    <div className="thumb">
      {showImg ? (
        <>
          {!loaded && <div className="thumb-skel" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(slug, thumbAt!)}
            alt={`Screenshot of ${slug}`}
            loading="lazy"
            draggable={false}
            onLoad={() => setLoadedKey(imgKey)}
            onError={() => setBroken(true)}
            style={{ opacity: loaded ? 1 : 0 }}
          />
        </>
      ) : (
        <div className="thumb-empty">
          {capturing && <i className="spin" aria-hidden="true" />}
          <span>{!deployed ? "Not deployed yet" : capturing ? "Taking screenshot…" : failed ? "No preview available" : "Preview pending"}</span>
        </div>
      )}
      {capturing && showImg && <i className="spin thumb-busy" aria-hidden="true" />}
    </div>
  );
}
