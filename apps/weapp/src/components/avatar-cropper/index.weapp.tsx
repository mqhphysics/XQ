import { NativeImageCropper } from './image.weapp'
export function AvatarCropper({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}) {
  return (
    <NativeImageCropper
      title="更换头像"
      ratio={1}
      output={{ width: 512, height: 512 }}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
