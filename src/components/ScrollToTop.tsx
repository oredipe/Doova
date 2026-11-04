"use client";
import { useEffect } from "react";

/** Result screens open at the top, even when arriving from the bottom of a long form. */
export function ScrollToTop() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return null;
}
