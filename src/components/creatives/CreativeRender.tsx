import { Style1_VS } from "@/components/creatives/templates/Style1_VS";
import { Style2_SplitAction } from "@/components/creatives/templates/Style2_SplitAction";
import { Style3_PremiumDark } from "@/components/creatives/templates/Style3_PremiumDark";
import { Style4_SideFade } from "@/components/creatives/templates/Style4_SideFade";
import { Style5_EditorialBlock } from "@/components/creatives/templates/Style5_EditorialBlock";
import {
  isEditorialBlockStyle,
  isPremiumDarkStyle,
  isSideFadeStyle,
  isSplitActionStyle,
} from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

export type CreativeRenderProps = CreativeTemplateProps & {
  styleId?: string | null;
};

/** Picks the React creative template for a studio style id / alias (1–5). */
export function CreativeRender({ styleId, ...props }: CreativeRenderProps) {
  if (isSplitActionStyle(styleId)) return <Style2_SplitAction {...props} />;
  if (isPremiumDarkStyle(styleId)) return <Style3_PremiumDark {...props} />;
  if (isSideFadeStyle(styleId)) return <Style4_SideFade {...props} />;
  if (isEditorialBlockStyle(styleId)) return <Style5_EditorialBlock {...props} />;
  return <Style1_VS {...props} />;
}
