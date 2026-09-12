
function Input({ name }: { name: string }) {
  return (
    <input className="mt-5 w-75 py-5 pl-2.5" type="text" placeholder={name} />
  );
}

export default Input;
