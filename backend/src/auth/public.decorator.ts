import { SetMetadata } from '@nestjs/common';

// Routes marked @Public() skip the global AuthGuard. Login + health check
// obviously need to be reachable without a cookie.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
