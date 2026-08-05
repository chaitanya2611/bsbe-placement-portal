import { createBrowserRouter } from 'react-router';
import { NotFoundPage } from '../pages/not-found-page';
import { PortalPage } from '../pages/portal-page';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <PortalPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
