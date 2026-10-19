import { Style1_VS } from "@/components/creatives/templates/Style1_VS";
import { Style2_SplitAction } from "@/components/creatives/templates/Style2_SplitAction";
import { isSplitActionStyle } from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

export type CreativeRenderProps = CreativeTemplateProps & {
  styleId?: string | null;
};

/** Picks the React creative template for a studio style id / alias. */
export function CreativeRender({ styleId, ...props }: CreativeRenderProps) {
  if (isSplitActionStyle(styleId)) {
    return <Style2_SplitAction {...props} />;
  }
  return <Style1_VS {...props} />;
}
