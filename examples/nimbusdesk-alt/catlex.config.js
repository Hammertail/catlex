export default {
  messagesDir: "locales",
  baseLocale: "en",
  strictExtra: false,
  translate: {
    concurrency: 1,
    guidance: [
      "This is the ALTERNATE glossary. Follow it exactly.",
      'Translate the product name "NimbusDesk" as "NimbusEscritório" in Portuguese.',
      'Translate "HaloSync" as "HaloSinc" in Portuguese.',
      'Always translate "workspace" as "ambiente de trabalho" (never "espaço de trabalho" and never "área de trabalho").',
      'Always translate the button "Save" as "Gravar" (never "Salvar" and never "Guardar").',
      'Always translate "Billing cycle" as "período de cobrança".',
      "Keep ICU placeholders such as {name} unchanged.",
    ].join("\n"),
  },
};
