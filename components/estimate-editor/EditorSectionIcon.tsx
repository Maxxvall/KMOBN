import { IconBolt, IconDrop, IconFolder, IconHome, IconLayers, IconSledgehammer, IconTruck, IconWater, IconWindowFrame } from '@devigner-ui/icons';
import { EstimateCategory, type SectionId } from '../../types';

const sectionIcons: Partial<Record<SectionId, typeof IconFolder>> = {
    [EstimateCategory.FOUNDATION]: IconLayers,
    [EstimateCategory.GRILLAGE]: IconLayers,
    [EstimateCategory.WALLS]: IconLayers,
    [EstimateCategory.ROOF]: IconHome,
    [EstimateCategory.WINDOWS]: IconWindowFrame,
    [EstimateCategory.WATER_SUPPLY]: IconDrop,
    [EstimateCategory.SEWERAGE]: IconWater,
    [EstimateCategory.ELECTRICAL]: IconBolt,
    [EstimateCategory.LOGISTICS]: IconTruck,
    [EstimateCategory.DEMOLITION]: IconSledgehammer,
};

export const EditorSectionIcon = ({ id, className = 'size-4 shrink-0' }: { id: SectionId; className?: string }) => {
    const Icon = sectionIcons[id] ?? IconFolder;
    return <Icon aria-hidden="true" className={className} />;
};
