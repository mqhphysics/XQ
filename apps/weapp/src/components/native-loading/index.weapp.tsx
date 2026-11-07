import { Image } from '@tarojs/components'
import animatedRing from '../../assets/login-art/cursors/loading-ring.weapp.gif'
import staticRing from '../../assets/login-art/cursors/loading-ring.svg'

/** Exported from the website SVG's six-segment, 1.2 second colour animation. */
export function NativeLoadingRing({ animated = true }: { animated?: boolean }) {
  return (
    <Image
      className="native-loading-ring"
      src={animated ? animatedRing : staticRing}
      mode="aspectFit"
      aria-hidden
    />
  )
}
