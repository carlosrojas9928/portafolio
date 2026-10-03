'use client';
// frontend/src/app/raffles/[slug]/page.tsx (extracto)
// Flujo público de compra en 3 pasos: elegir números -> reservar y pagar -> enviado.

type Step = 'browsing' | 'reserved' | 'submitted';

export default function RaffleDetailPage() {
  const [selected, setSelected] = useState<number[]>([]);
  const [step, setStep] = useState<Step>('browsing');
  const [method, setMethod] = useState<PaymentMethod>('NEQUI');
  const [file, setFile] = useState<File | null>(null);
  // ... raffle, loading, error, reference, submitting ...

  const toggleNumber = (n: number) =>
    setSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  // Paso 1 -> 2: reserva los números elegidos
  const handleReserve = async () => {
    try {
      const res = await api.post<{ totalAmount: number }>('/numbers/reserve', {
        raffleId: raffle.id,
        numbers: selected,
      });
      setReservationTotal(res.totalAmount);
      setStep('reserved');
    } catch (err) {
      setSubmitError(errMsg(err, 'Puede que esos números ya no estén disponibles.'));
    }
  };

  // Paso 2 -> 3: envía el comprobante para que el organizador lo revise
  const handleUploadPayment = async () => {
    const formData = new FormData();
    formData.append('raffleId', raffle.id);
    formData.append('numbers', JSON.stringify(selected));
    formData.append('method', method);
    formData.append('proof', file);
    await api.postForm('/payments', formData);
    setStep('submitted');
  };

  return (
    <main className="cnt-md stack-lg py-10">
      {/* tarjeta con premio, precio, fecha y barra de progreso de ventas */}
      {step === 'browsing' && (
        <NumberGrid numbers={raffle.numbers} selectedNumbers={selected} onSelect={toggleNumber}
                    disabled={raffle.status !== 'ACTIVE'} />
      )}
      {step === 'reserved' && /* método de pago (Nequi / transferencia) + comprobante */ null}
      {step === 'submitted' && /* alerta: "Comprobante enviado" */ null}
    </main>
  );
}
