import RegistrationWizard from '@/components/RegistrationWizard';
import Image from 'next/image';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f81838] to-[#2b0308]">
      <section className="w-full bg-[#f81838]">
        <div className="w-full max-w-2xl mx-auto">
          <Image 
            src="/revival-kids-poster.jpg" 
            alt="Revival Kids Poster" 
            width={1200}
            height={1600}
            className="w-full h-auto"
            priority
          />
        </div>
      </section>
      
      <section className="py-24 px-6 md:px-12 max-w-3xl mx-auto text-white">
        <div id="registration" className="bg-poster-bg-light/50 border border-poster-accent/20 rounded-2xl p-8 md:p-10 backdrop-blur-sm shadow-xl scroll-mt-12">
          <h3 className="text-2xl md:text-3xl font-black mb-8 text-white uppercase tracking-wider text-center drop-shadow-md">Secure your place today</h3>
          <RegistrationWizard />
        </div>
      </section>
    </main>
  );
}
