import { brand } from '../brand';

/**
 * Pictures of the v2 screens per brand. `require` of an image only works in the
 * app bundle, so they live here and not in the brand definitions (src/brand).
 * The Koala photo is the Figma placeholder (AI-generated, generic): replace it
 * with the client's own shot when it arrives.
 */
const photos: Record<string, number> = {
  koala: require('../../brands/koala/welcome-photo.jpg'),
};

export const welcomePhoto: number | undefined = photos[brand.slug];
