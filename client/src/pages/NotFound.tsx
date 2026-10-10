import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-32 text-center">
      <div className="eyebrow">404</div>
      <h1 className="display mt-3 text-4xl">lost in the dunes.</h1>
      <Link to="/" className="btn-ghost mt-8">
        Back to the pyramid
      </Link>
    </div>
  );
}
