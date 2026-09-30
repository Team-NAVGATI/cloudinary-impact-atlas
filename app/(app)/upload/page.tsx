import { redirect } from 'next/navigation';

/** Uploading now lives in the Studio. */
export default function UploadRedirect() {
  redirect('/studio');
}
