import Modal from "./Modal";

interface AddTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function AddTeamModal({
  isOpen,
  onClose,
  onSubmit,
}: AddTeamModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-8">Добавить команду</h2>
        
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid gap-6">
            <div>
              <label htmlFor="teamName" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                Название команды
              </label>
              <input
                type="text"
                id="teamName"
                name="teamName"
                required
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 transition-all duration-200"
                placeholder="Введите название команды"
              />
            </div>
            <div>
              <label htmlFor="startKart" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                Номер первого карта
              </label>
              <input
                type="number"
                id="startKart"
                name="startKart"
                required
                min="1"
                max="999"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 transition-all duration-200"
                placeholder="Введите номер карта"
              />
            </div>
          </div>
          
          <div className="flex gap-4 justify-center pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-3 text-gray-300 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors duration-200 min-w-[120px]"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 min-w-[120px]"
            >
              Добавить
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}