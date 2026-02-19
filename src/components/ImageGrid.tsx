import type { BackgroundMode, ImageItem } from "../lib/types";
import { ImageCard } from "./ImageCard";

interface ImageGridProps {
  images: ImageItem[];
  backgroundMode: BackgroundMode;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onDownload?: (image: ImageItem) => void;
}

export function ImageGrid({
  images,
  backgroundMode,
  onRetry,
  onRemove,
  onDownload,
}: ImageGridProps) {
  if (images.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-4">
      {images.map((image) => (
        <ImageCard
          key={image.id}
          image={image}
          backgroundMode={backgroundMode}
          onRetry={onRetry}
          onRemove={onRemove}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}
