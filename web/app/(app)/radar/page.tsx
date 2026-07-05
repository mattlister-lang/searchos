import { RadarWorkspace } from "@/components/radar-workspace";

/**
 * R6 — the Radar page (product brief §12). Entirely operator-driven and
 * stateless: the page is a shell around the client workspace, which calls the
 * allowlisted server actions (JD parse, pool match, Apollo search) and the
 * existing confirm-gated write paths (Create job / Log BD deal / Add person).
 * No server data is read here, so there is nothing to force-dynamic beyond the
 * layout's auth gate.
 */
export default function RadarPage() {
  return <RadarWorkspace />;
}
