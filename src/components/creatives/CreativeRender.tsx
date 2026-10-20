import { Style1_VS } from "@/components/creatives/templates/Style1_VS";
import { Style2_SplitAction } from "@/components/creatives/templates/Style2_SplitAction";
import { Style3_PremiumDark } from "@/components/creatives/templates/Style3_PremiumDark";
import { Style4_SideFade } from "@/components/creatives/templates/Style4_SideFade";
import { Style5_EditorialBlock } from "@/components/creatives/templates/Style5_EditorialBlock";
import { CREATIVE_STYLE_IDS } from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

export type CreativeRenderProps = CreativeTemplateProps & {
  /** `creative_templates.id` (UUID) of the style to render. */
  styleId?: string | null;
};

/**
 * Strict mapping: creative_templates UUID -> React template.
 * Unknown ids fall back to Style1_VS with a console warning.
 */
export function CreativeRender({ styleId, ...props }: CreativeRenderProps) {
  if (styleId === CREATIVE_STYLE_IDS.splitAction) return <Style2_SplitAction {...props} />;
  if (styleId === CREATIVE_STYLE_IDS.premiumDark) return <Style3_PremiumDark {...props} />;
  if (styleId === CREATIVE_STYLE_IDS.sideFade) return <Style4_SideFade {...props} />;
  if (styleId === CREATIVE_STYLE_IDS.editorialBlock) return <Style5_EditorialBlock {...props} />;
  if (styleId === CREATIVE_STYLE_IDS.beforeAfterVs) return <Style1_VS {...props} />;

  console.warn(`[CreativeRender] Unknown styleId "${styleId ?? ""}", falling back to Style1_VS.`);
  return <Style1_VS {...props} />;
}
