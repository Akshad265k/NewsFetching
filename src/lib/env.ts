import { z } from 'zod';

/**
 * Environment variable validation schema
 * This ensures all required environment variables are present and valid at startup
 */
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Public variables (exposed to browser)
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // Locked PDF decrypt service (Cloud Run)
  LOCKED_PDF_DECRYPT_URL: z.string().url().optional(),
  LOCKED_PDF_DECRYPT_TOKEN: z.string().min(1).optional(),
  
  // Add other environment variables here as needed
  // Example: API_KEY: z.string().min(1, "API key is required"),
});

/**
 * Validates and returns typed environment variables
 * Throws an error with details if validation fails
 */
export function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues.map(
        (err) => `  - ${err.path.join('.')}: ${err.message}`
      ).join('\n');
      
      throw new Error(
        `❌ Invalid environment variables:\n${missingVars}\n\n` +
        `Please check your .env file or environment configuration.`
      );
    }
    throw error;
  }
}

/**
 * Typed environment variables
 * Use this instead of process.env for type safety
 */
export const env = validateEnv();

// Export type for use in other files
export type Env = z.infer<typeof envSchema>;
