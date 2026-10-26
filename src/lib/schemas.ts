import { z } from "zod";

/** GeoJSON order: [longitude, latitude]. */
export const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const clockTime = z.string().regex(/^\d{2}:\d{2}$/);
